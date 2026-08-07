import { Logger } from '@nestjs/common';
import { OpenAiAdapter } from './openai.adapter';

/**
 * The parameter negotiation is the part of this adapter that cannot be
 * exercised against a live key without owning a model of each family, so it is
 * covered here: the request body is asserted attempt by attempt.
 */
describe('OpenAiAdapter', () => {
  const adapter = new OpenAiAdapter();
  const base = {
    model: 'gpt-4o-mini',
    apiKey: 'sk-test',
    system: 'You are Ivy.',
    messages: [{ role: 'user' as const, content: 'Hi' }],
  };

  const ok = (text: string) => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
      model: 'gpt-4o-mini-2026',
    }),
  });
  const badRequest = (payload: unknown) => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify(payload),
  });

  let fetchMock: jest.Mock;
  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the persona as a system message and returns normalized usage', async () => {
    fetchMock.mockResolvedValueOnce(ok('Hello!'));

    const res = await adapter.complete({ ...base, maxTokens: 512 });

    expect(res).toEqual({
      text: 'Hello!',
      tokensIn: 11,
      tokensOut: 7,
      provider: 'openai',
      model: 'gpt-4o-mini-2026',
    });
    expect(bodies()[0].messages).toEqual([
      { role: 'system', content: 'You are Ivy.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(bodies()[0].max_completion_tokens).toBe(512);
  });

  it('omits temperature entirely when the tenant did not configure one', async () => {
    fetchMock.mockResolvedValueOnce(ok('ok'));

    await adapter.complete(base);

    expect(bodies()[0]).not.toHaveProperty('temperature');
  });

  it('drops temperature and retries when the model rejects it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        badRequest({
          error: { param: 'temperature', message: "Unsupported value: 'temperature' does not support 0.3" },
        }),
      )
      .mockResolvedValueOnce(ok('answered anyway'));

    const res = await adapter.complete({ ...base, temperature: 0.3 });

    expect(res.text).toBe('answered anyway');
    expect(bodies()[0].temperature).toBe(0.3);
    expect(bodies()[1]).not.toHaveProperty('temperature');
    // The cap must survive the retry — dropping it would silently uncap output.
    expect(bodies()[1].max_completion_tokens).toBeDefined();
  });

  it('falls back to max_tokens for models that do not know the modern name', async () => {
    fetchMock
      .mockResolvedValueOnce(
        badRequest({
          error: { message: 'Unrecognized request argument supplied: max_completion_tokens' },
        }),
      )
      .mockResolvedValueOnce(ok('legacy model reply'));

    const res = await adapter.complete({ ...base, maxTokens: 256 });

    expect(res.text).toBe('legacy model reply');
    expect(bodies()[1].max_tokens).toBe(256);
    expect(bodies()[1]).not.toHaveProperty('max_completion_tokens');
  });

  it('negotiates both fields when a model rejects each in turn', async () => {
    fetchMock
      .mockResolvedValueOnce(badRequest({ error: { param: 'temperature', message: 'no' } }))
      .mockResolvedValueOnce(
        badRequest({ error: { message: 'Unrecognized request argument supplied: max_completion_tokens' } }),
      )
      .mockResolvedValueOnce(ok('third time'));

    await expect(adapter.complete({ ...base, temperature: 0.3, maxTokens: 128 })).resolves.toMatchObject({
      text: 'third time',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws on a 400 that blames something it cannot renegotiate', async () => {
    fetchMock.mockResolvedValueOnce(
      badRequest({ error: { param: 'model', message: 'The model `gpt-nope` does not exist' } }),
    );

    await expect(adapter.complete(base)).rejects.toThrow('OpenAI API error 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a field it already dropped', async () => {
    fetchMock
      .mockResolvedValueOnce(badRequest({ error: { param: 'temperature', message: 'no' } }))
      .mockResolvedValueOnce(badRequest({ error: { param: 'temperature', message: 'still no' } }));

    await expect(adapter.complete({ ...base, temperature: 0.3 })).rejects.toThrow('OpenAI API error 400');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces non-400 failures immediately so the gateway can fall back to the stub', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' });

    await expect(adapter.complete(base)).rejects.toThrow('OpenAI API error 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never logs the key the provider quoted back in its error', async () => {
    // Observed on staging: OpenAI's 401 body repeats the rejected key verbatim.
    const logged: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: unknown) => void logged.push(String(m)));
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"message":"Incorrect API key provided: sk-test. You can find..."}',
    });

    await expect(adapter.complete(base)).rejects.toThrow('OpenAI API error 401');

    expect(logged.join('\n')).not.toContain('sk-test');
    expect(logged.join('\n')).toContain('Incorrect API key provided');
    spy.mockRestore();
  });

  it('refuses to call the API without a key', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(adapter.complete({ ...base, apiKey: undefined })).rejects.toThrow(
      'OpenAI API key not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  });
});
