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
  const player = (tracks: unknown[]) => ({
    videoDetails: { title: 'Hotel Admin 안내' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
  });

  afterEach(() => {
    (global.fetch as jest.Mock | undefined)?.mockRestore?.();
  });

  it('prefers a manual track over asr and decodes timedtext-v3 <p> payloads', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        player([
          { baseUrl: 'https://yt/asr', languageCode: 'ko', kind: 'asr' },
          { baseUrl: 'https://yt/manual', languageCode: 'ko' },
        ]),
      text: async () =>
        String(url).startsWith('https://yt/manual')
          ? '<?xml version="1.0"?><timedtext format="3"><body>' +
            '<p t="0" d="2"><s>리뷰 답글은</s> <s>&amp;quot;1회&amp;quot;만</s></p>' +
            '<p t="2" d="2">등록할 수 있습니다</p></body></timedtext>'
          : '',
    })) as unknown as typeof fetch;

    const out = await fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ');
    expect(out.track).toBe('ko');
    expect(out.title).toBe('Hotel Admin 안내');
    expect(out.text).toBe('리뷰 답글은 &quot;1회&quot;만 등록할 수 있습니다');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(
      expect.arrayContaining([expect.stringContaining('youtubei/v1/player'), 'https://yt/manual']),
    );
  });

  it('still reads the older srv1 <text> shape', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => player([{ baseUrl: 'https://yt/t', languageCode: 'en' }]),
      text: async () =>
        String(url) === 'https://yt/t'
          ? '<transcript><text start="0" dur="2">check-in from 3pm</text></transcript>'
          : '',
    })) as unknown as typeof fetch;
    const out = await fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ');
    expect(out.text).toBe('check-in from 3pm');
  });

  it('maps a caption-less video to the specific code', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ videoDetails: { title: 'no captions' } }),
      text: async () => '',
    })) as unknown as typeof fetch;
    await expect(fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ')).rejects.toMatchObject({
      errorCode: 'E5070',
    });
  });

  it('maps an empty caption body to the specific code', async () => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => player([{ baseUrl: 'https://yt/t', languageCode: 'en' }]),
      text: async () => (String(url) === 'https://yt/t' ? '' : 'x'),
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
