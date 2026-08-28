import { HttpStatus } from '@nestjs/common';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Public-caption transcript extraction for YouTube URLs (PLN-260829 P3-8, R5 P1).
 *
 * Deliberately dependency-free and isolated: it scrapes the watch page for the
 * caption track list, which is an implementation detail YouTube may change.
 * When it breaks, every failure funnels into ONE error code (E5070) and this
 * file is the only thing to fix or swap — nothing else knows how the text was
 * obtained. Speech-to-text for caption-less videos is P2, out of scope.
 */
export interface VideoTranscript {
  videoId: string;
  title: string;
  /** Language code of the track used, e.g. "ko" or "en (auto-generated)". */
  track: string;
  text: string;
}

const WATCH_TIMEOUT_MS = 15_000;

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

  const page = await get(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
  const player = extractPlayerResponse(page);
  if (!player) throw noTranscript();

  const title = (player.videoDetails?.title as string) ?? videoId;
  const tracks = (player.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
    []) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
  if (!tracks.length) throw noTranscript();

  // Manual captions first — auto (asr) transcripts are the fallback, not the
  // preference: they carry recognition errors straight into the knowledge base.
  const track = tracks.find((t) => t.kind !== 'asr') ?? tracks[0];
  const label = `${track.languageCode}${track.kind === 'asr' ? ' (auto-generated)' : ''}`;

  const xml = await get(`${track.baseUrl}&fmt=srv1`);
  const text = decodeTranscriptXml(xml);
  if (!text.trim()) throw noTranscript();
  return { videoId, title, track: label, text };
}

function noTranscript(): BusinessException {
  return new BusinessException(ERROR_CODE.INGEST_NO_TRANSCRIPT, HttpStatus.BAD_REQUEST);
}

async function get(url: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), WATCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'accept-language': 'en' },
    });
    if (!res.ok) throw noTranscript();
    return await res.text();
  } catch (e) {
    if (e instanceof BusinessException) throw e;
    throw noTranscript();
  } finally {
    clearTimeout(timer);
  }
}

/** The watch page embeds `ytInitialPlayerResponse = {...};` — slice the JSON out. */
function extractPlayerResponse(page: string): {
  videoDetails?: Record<string, unknown>;
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] };
  };
} | null {
  const start = page.indexOf('ytInitialPlayerResponse = ');
  if (start < 0) return null;
  const jsonStart = page.indexOf('{', start);
  // Balance braces instead of regexing to the "end": titles may contain `};`.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < page.length; i++) {
    const ch = page[i];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(page.slice(jsonStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** srv1 format: `<text start="…" dur="…">escaped line</text>` per caption. */
function decodeTranscriptXml(xml: string): string {
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
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
