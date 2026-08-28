import { fetchYoutubeTranscript, parseYoutubeId } from './youtube-transcript.util';

describe('parseYoutubeId', () => {
  it('accepts the common URL shapes', () => {
    expect(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects everything else', () => {
    expect(parseYoutubeId('https://vimeo.com/12345')).toBeNull();
    expect(parseYoutubeId('not a url')).toBeNull();
  });
});

describe('fetchYoutubeTranscript', () => {
  const page = (player: Record<string, unknown>) =>
    `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var other = 1;</script></html>`;

  afterEach(() => {
    (global.fetch as jest.Mock | undefined)?.mockRestore?.();
  });

  it('prefers a manual track over asr and decodes the srv1 payload', async () => {
    const player = {
      videoDetails: { title: 'Hotel Admin 안내 — {중괄호}; 포함' },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: 'https://yt/asr', languageCode: 'ko', kind: 'asr' },
            { baseUrl: 'https://yt/manual', languageCode: 'ko' },
          ],
        },
      },
    };
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      text: async () =>
        String(url).startsWith('https://yt/manual')
          ? '<transcript><text start="0" dur="2">리뷰 답글은 &amp;quot;1회&amp;quot;만</text><text start="2" dur="2">등록할 수 있습니다</text></transcript>'
          : page(player),
    })) as unknown as typeof fetch;

    const out = await fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ');
    expect(out.track).toBe('ko');
    expect(out.title).toContain('중괄호');
    expect(out.text).toBe('리뷰 답글은 &quot;1회&quot;만 등록할 수 있습니다');
    // The manual track was fetched, not the asr one.
    expect((global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('https://yt/manual')]),
    );
  });

  it('maps a caption-less video to the specific code', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => page({ videoDetails: { title: 'no captions' } }),
    })) as unknown as typeof fetch;
    await expect(fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ')).rejects.toMatchObject({
      errorCode: 'E5070',
    });
  });

  it('maps a non-YouTube URL to the specific code without fetching', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(fetchYoutubeTranscript('https://vimeo.com/1')).rejects.toMatchObject({
      errorCode: 'E5070',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
