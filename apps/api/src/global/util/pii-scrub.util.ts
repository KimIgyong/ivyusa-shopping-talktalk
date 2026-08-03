/**
 * PII minimization for AI egress (privacy plan Stage 5 — data minimization).
 *
 * `scrubPii` masks PII in the COPY of a user message that leaves the system
 * toward an AI provider (intent classification / RAG answer). The original
 * text is persisted untouched — agents need it in the console; only the
 * egress copy is minimized. This complements `maskPii` (`pii.util.ts`, log
 * masking) — the two serve different controls, do not merge them.
 *
 * Design notes:
 * - Ordered passes: EMAIL → CARD → PHONE → ADDR → ORDER. Cards are consumed
 *   whole before the phone rules can half-eat a 13-16 digit run, and an
 *   address unit tail (`#401`) is consumed before the `#`-order rule sees it.
 * - Replacement tokens contain no digits or `@`, so the function is
 *   idempotent: scrubPii(scrubPii(x).text).text === scrubPii(x).text.
 * - Pure function, no NestJS/DI, no external deps.
 *
 * Conservative by intent (false negatives preferred over mangling text):
 * - UNSEPARATED digit runs (SKUs like `SKU-12345678`, tracking numbers, URL
 *   ids, plain integers) are never phone-masked; only formatted numbers are
 *   (+intl, US `415-555-0100` / `(415) 555-0100`, KR `010-1234-5678`,
 *   dash/dot-separated runs totalling 9–15 digits).
 * - Space-only separated US numbers without parentheses (`415 555 0100`) are
 *   left alone — indistinguishable from quantity lists.
 * - Dates (`2026-07-31`), prices (`$1,234.99`), zips (`94103`, `94103-1234`),
 *   times (`12:30`) and integers < 9 digits never match the phone rules.
 * - Card masking requires a Luhn pass over 13–19 digits — no Luhn, no mask.
 *   (Conversely, any Luhn-valid 13–19 digit run IS masked, even after a
 *   prefix like `REF-`: card-shaped data must not reach the provider.)
 * - Addresses need `number + Capitalized street name(s) + known suffix`
 *   (St/Ave/Blvd/Rd/Dr/Ln/Way/Ct …); lowercase or suffix-less addresses pass
 *   through rather than risk mangling normal sentences.
 * - `#` + 3+ digits is treated as a Shopify-style order ref; rare hash
 *   literals such as hex colors (`#112233`) are accepted collateral.
 */

export interface PiiScrubResult {
  /** The scrubbed egress copy — never the string to persist. */
  text: string;
  /** Non-zero replacement counts by kind: email/card/phone/order/address. */
  counts: Record<string, number>;
}

/** Token labels — bracketed, digit-free, so passes never re-match them. */
const TOKEN = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  card: '[CARD]',
  order: '[ORDER]',
  address: '[ADDR]',
} as const;

type PiiKind = keyof typeof TOKEN;

/** RFC-lite e-mail; unicode local parts tolerated (ko et al.). */
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;

/** 13–19 digits with optional single space/dash separators (Luhn-gated). */
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

/** International: +CC then separated digit groups (digit count gated 8–15). */
const PHONE_INTL_RE = /\+\d{1,3}(?:[ .-]?\(\d{1,4}\))?(?:[ .-]?\d{1,4}){2,5}/g;

/** US with area-code parentheses: (415) 555-0100 / (415)5550100. */
const PHONE_US_PAREN_RE = /\(\d{3}\)[ .-]?\d{3}[ .-]?\d{4}\b/g;

/** US dashed/dotted with a consistent separator: 415-555-0100 / 415.555.0100. */
const PHONE_US_SEP_RE = /\b(\d{3})([.-])(\d{3})\2(\d{4})\b/g;

/** KR mobile: 010-1234-5678, 010 1234 5678, 01012345678, 011/016..019. */
const PHONE_KR_RE = /\b01[016789][ .-]?\d{3,4}[ .-]?\d{4}\b/g;

/** Generic separated digit run (dash/dot only), gated to 9–15 digits. */
const PHONE_GENERIC_RE = /\b\d{1,4}(?:[.-]\d{2,4}){2,5}\b/g;

/** Leading `19xx-`/`20xx-` style — reject generic candidates that are dates. */
const DATE_LEAD_RE = /^(?:19|20)\d{2}[.-]/;

/** US street address: number + Capitalized name word(s) + suffix + unit tail. */
const ADDR_RE = new RegExp(
  '\\b\\d{1,5}\\s+' +
    "(?:(?:\\d{1,4}(?:st|nd|rd|th)|[A-Z][A-Za-z'.-]*)\\s+){1,3}" +
    '(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court)\\.?\\b' +
    '(?:[,\\s]+(?:Suite|Ste\\.?|Apt\\.?|Apartment|Unit|#)\\s*[A-Za-z0-9-]+)?',
  'g',
);

/** Shopify-style order ref: `#` + 3 or more digits. */
const ORDER_HASH_RE = /#\d{3,}\b/g;

/** en/es order phrasing followed by a 3–6 digit number. */
const ORDER_WORD_RE =
  /\b((?:order|pedido|orden)(?:\s+(?:number|no\.?|num|id|n[uú]mero))?\s*[:#]?\s*)(\d{3,6})(?!\d)/gi;

/** ko order phrasing (주문번호/주문 번호/주문) followed by a 3–6 digit number. */
const ORDER_KO_RE = /((?:주문\s*번호|주문)\s*[:#]?\s*)(\d{3,6})(?!\d)/g;

/** Luhn checksum over a digit-only string. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function countDigits(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 48 && c <= 57) n += 1;
  }
  return n;
}

/**
 * Mask PII in `text` for AI egress. Returns the scrubbed copy plus non-zero
 * replacement counts (e.g. `{ email: 1, phone: 2 }`) for observability —
 * counts only, never the matched values, so they are safe to log.
 */
export function scrubPii(text: string): PiiScrubResult {
  const counts: Record<string, number> = {};
  if (!text) return { text, counts };

  const bump = (kind: PiiKind): string => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return TOKEN[kind];
  };

  let out = text;

  // 1. Emails — before phone rules can nibble digit-heavy local parts.
  out = out.replace(EMAIL_RE, () => bump('email'));

  // 2. Cards — before phones, so a 13-16 digit PAN is consumed whole.
  //    Luhn-gated: a failing run is left for the phone rules (or untouched).
  out = out.replace(CARD_RE, (m) => {
    const digits = m.replace(/[ -]/g, '');
    return luhnValid(digits) ? bump('card') : m;
  });

  // 3. Phones — most-specific first; every rule re-checks total digit count.
  out = out.replace(PHONE_INTL_RE, (m) => {
    const n = countDigits(m);
    return n >= 8 && n <= 15 ? bump('phone') : m;
  });
  out = out.replace(PHONE_US_PAREN_RE, () => bump('phone'));
  out = out.replace(PHONE_US_SEP_RE, () => bump('phone'));
  out = out.replace(PHONE_KR_RE, () => bump('phone'));
  out = out.replace(PHONE_GENERIC_RE, (m) => {
    if (DATE_LEAD_RE.test(m)) return m;
    const n = countDigits(m);
    return n >= 9 && n <= 15 ? bump('phone') : m;
  });

  // 4. Addresses — before the order rule, so a `#401` unit tail is consumed
  //    as part of the address rather than half-masked as an order number.
  out = out.replace(ADDR_RE, () => bump('address'));

  // 5. Order numbers — `#1234` whole; phrased forms keep the phrase and mask
  //    only the number ("order [ORDER]").
  out = out.replace(ORDER_HASH_RE, () => bump('order'));
  out = out.replace(ORDER_WORD_RE, (_m, lead: string) => `${lead}${bump('order')}`);
  out = out.replace(ORDER_KO_RE, (_m, lead: string) => `${lead}${bump('order')}`);

  return { text: out, counts };
}
