import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Public-caption transcript extraction for YouTube URLs (PLN-260829 P3-8, R5 P1).
 *
 * Uses the innertube player endpoint with an ANDROID client context — the
 * watch-page caption URLs stopped returning bodies without a proof-of-origin
 * token (observed on the first staging run: tracks parsed, timedtext came back
 * 0 bytes), while the ANDROID-context URLs still serve the captions. This is
 * still an unofficial surface: it is deliberately isolated here, and every
 * failure funnels into ONE error code (E5070) so when YouTube changes again
 * this file is the only thing to fix. Speech-to-text for caption-less videos
 * is P2, out of scope.
 */
export interface VideoTranscript {
  videoId: string;
  title: string;
  /** Language code of the track used, e.g. "ko" or "en (auto-generated)". */
  track: string;
  text: string;
}

const FETCH_TIMEOUT_MS = 15_000;

/** Accepts watch/short/embed/youtu.be forms; null when it is not YouTube. */
export function parseYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

export async function fetchYoutubeTranscript(url: string): Promise<VideoTranscript> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw noTranscript();

  const player = (await request('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' },
      },
    }),
  }).then((r) => r.json() as Promise<Record<string, any>>).catch(() => null)) as {
    videoDetails?: { title?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } };
  } | null;
  if (!player) throw noTranscript();

  const title = player.videoDetails?.title ?? videoId;
  const tracks = (player.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
    []) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
  if (!tracks.length) throw noTranscript();

  // Manual captions first — auto (asr) transcripts are the fallback, not the
  // preference: they carry recognition errors straight into the knowledge base.
  const track = tracks.find((t) => t.kind !== 'asr') ?? tracks[0];
  const label = `${track.languageCode}${track.kind === 'asr' ? ' (auto-generated)' : ''}`;

  const xml = await request(track.baseUrl).then((r) => r.text());
  const text = decodeTranscriptXml(xml);
  if (!text.trim()) throw noTranscript();
  return { videoId, title, track: label, text };
}

function noTranscript(): BusinessException {
  return new BusinessException(ERROR_CODE.INGEST_NO_TRANSCRIPT, HttpStatus.BAD_REQUEST);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw noTranscript();
    return res;
  } catch (e) {
    if (e instanceof BusinessException) throw e;
    throw noTranscript();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Caption XML: timedtext format=3 uses `<p t="…">line</p>` (possibly with
 * nested `<s>` word spans); the older srv1 shape uses `<text …>line</text>`.
 * Both are handled — the format is whatever the served URL decides.
 */
function decodeTranscriptXml(xml: string): string {
  const lines = [
    ...xml.matchAll(/<(?:text|p)(?:\s[^>]*)?>([\s\S]*?)<\/(?:text|p)>/g),
  ].map((m) => m[1].replace(/<[^>]+>/g, ''));
  // `&amp;` last — decoding it first turns `&amp;quot;` (a literal `&quot;`
  // in the caption) into `"` via a second, unintended decode pass.
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\n/g, ' ');
  return lines.map(decode).join(' ').replace(/\s+/g, ' ').trim();
}
