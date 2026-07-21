/**
 * UTM capture + traffic-source segmentation.
 *
 * The widget runs in an iframe, so it can't see the storefront's UTM params
 * directly — embed.js captures them on the store page and forwards them on the
 * iframe URL (utm_source, …, plus ivy_ref = document.referrer and ivy_land =
 * landing URL). This module reads them, derives a GA4-style default channel
 * grouping for precise source attribution, and persists BOTH first-touch (kept
 * for the whole browser session) and last-touch (updated each load) so
 * conversions can be attributed either way.
 */

export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

export interface TrafficSource extends UtmParams {
  /** GA4-style default channel grouping, derived from source/medium/referrer. */
  channel: string;
  /** document.referrer of the storefront page (host only), when available. */
  referrer: string | null;
  /** Landing page URL of the storefront visit. */
  landingPage: string | null;
}

export interface Attribution {
  firstTouch: TrafficSource;
  lastTouch: TrafficSource;
}

const FIRST_TOUCH_KEY = 'ivy_attr_first';
const LAST_TOUCH_KEY = 'ivy_attr_last';

const SEARCH_ENGINES = /google|bing|yahoo|duckduckgo|yandex|baidu|naver|daum|ecosia/i;
const SOCIAL_SITES =
  /facebook|fb\.|instagram|twitter|t\.co|x\.com|tiktok|pinterest|linkedin|youtube|reddit|kakao|threads/i;
const SHOPPING_SITES = /shopping|shop\.app|google.*shopping/i;

function pick(params: URLSearchParams, key: string): string | null {
  const v = params.get(key);
  return v && v.trim() ? v.trim().slice(0, 200) : null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 200);
  }
}

/**
 * Map (source, medium, referrer) to a GA4 default-channel-grouping label. This
 * is the "세분화된 트래픽 출처" — turns raw UTM + referrer into one clean channel
 * so reports don't fragment across inconsistent tagging.
 */
export function deriveChannel(
  source: string | null,
  medium: string | null,
  referrer: string | null,
): string {
  const s = (source ?? '').toLowerCase();
  const m = (medium ?? '').toLowerCase();
  const refHost = hostOf(referrer) ?? '';

  if (m.includes('email') || s === 'email' || s === 'newsletter') return 'Email';
  if (m === 'affiliate' || m === 'referral') return 'Referral';
  if (/cpc|ppc|paid|cpm|paidsearch/.test(m)) {
    return SOCIAL_SITES.test(s) ? 'Paid Social' : 'Paid Search';
  }
  if (/social|sns/.test(m) || SOCIAL_SITES.test(s) || SOCIAL_SITES.test(refHost)) {
    return 'Organic Social';
  }
  if (SHOPPING_SITES.test(s) || SHOPPING_SITES.test(refHost)) return 'Shopping';
  if (m === 'organic' || SEARCH_ENGINES.test(s) || SEARCH_ENGINES.test(refHost)) {
    return 'Organic Search';
  }
  // A UTM tag with no clearer signal, or any other tagged campaign.
  if (s || m || source || medium) return 'Referral';
  if (refHost) return 'Referral';
  return 'Direct';
}

/** Read UTM + referrer + landing from the widget's own URL params (forwarded by embed.js). */
export function readTrafficSource(search: string = window.location.search): TrafficSource {
  const p = new URLSearchParams(search);
  const utm: UtmParams = {
    source: pick(p, 'utm_source'),
    medium: pick(p, 'utm_medium'),
    campaign: pick(p, 'utm_campaign'),
    term: pick(p, 'utm_term'),
    content: pick(p, 'utm_content'),
  };
  const referrer = pick(p, 'ivy_ref');
  const landingPage = pick(p, 'ivy_land');
  return {
    ...utm,
    referrer: hostOf(referrer),
    landingPage,
    channel: deriveChannel(utm.source, utm.medium, referrer),
  };
}

function hasSignal(t: TrafficSource): boolean {
  return !!(t.source || t.medium || t.campaign || t.referrer || t.channel !== 'Direct');
}

function readStored(key: string): TrafficSource | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TrafficSource) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: TrafficSource): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / disabled) — attribution is best-effort */
  }
}

/**
 * Resolve and persist attribution. First-touch is written once per session and
 * never overwritten; last-touch is refreshed whenever a new tagged visit arrives
 * (a bare Direct reload doesn't clobber a prior campaign's last-touch).
 */
export function resolveAttribution(search?: string): Attribution {
  const current = readTrafficSource(search);

  const firstTouch = readStored(FIRST_TOUCH_KEY) ?? current;
  if (!readStored(FIRST_TOUCH_KEY)) store(FIRST_TOUCH_KEY, current);

  const prevLast = readStored(LAST_TOUCH_KEY);
  const lastTouch = hasSignal(current) || !prevLast ? current : prevLast;
  if (hasSignal(current) || !prevLast) store(LAST_TOUCH_KEY, lastTouch);

  return { firstTouch, lastTouch };
}

/**
 * Flatten attribution into GA4 event params. Sent on every event so each hit
 * (including the purchase conversion) is attributable to its precise source.
 */
export function attributionParams(a: Attribution): Record<string, string> {
  const out: Record<string, string> = {
    traffic_channel: a.lastTouch.channel,
    first_touch_channel: a.firstTouch.channel,
  };
  const add = (k: string, v: string | null) => {
    if (v) out[k] = v;
  };
  add('utm_source', a.lastTouch.source);
  add('utm_medium', a.lastTouch.medium);
  add('utm_campaign', a.lastTouch.campaign);
  add('utm_term', a.lastTouch.term);
  add('utm_content', a.lastTouch.content);
  add('page_referrer', a.lastTouch.referrer);
  add('landing_page', a.lastTouch.landingPage);
  add('first_touch_source', a.firstTouch.source);
  add('first_touch_campaign', a.firstTouch.campaign);
  return out;
}
