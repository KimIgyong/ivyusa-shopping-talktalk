/**
 * Email body normalization for the chat pipeline.
 *
 * A reply email repeats the whole thread underneath it. Feeding that to the AI
 * wastes the context window and, worse, lets an older question outrank the new
 * one in retrieval — so only the top-most written part is kept.
 */

/** Markers that begin the quoted history of a reply, in several clients/locales. */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*(original message|forwarded message)\s*-{2,}/im,
  /^_{5,}$/m,
  // "On Mon, 10 Aug 2026 at 14:31, Someone <a@b.com> wrote:"
  /^on .{10,120}\bwrote:\s*$/im,
  // Korean/Spanish equivalents Gmail emits.
  /^\d{4}년 \d{1,2}월 \d{1,2}일.*작성:\s*$/im,
  /^el .{10,120}\bescribió:\s*$/im,
  /^от:.*$/im,
];

/** Signature separator per RFC 3676 §4.3. */
const SIGNATURE = /^-- $/m;

/**
 * Strip quoted history, the signature block and trailing blank lines.
 * Returns '' when nothing but quotes remain — the caller skips such mails.
 */
export function stripQuotedReply(body: string): string {
  let text = body.replace(/\r\n/g, '\n');

  let cut = text.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  text = text.slice(0, cut);

  const signature = SIGNATURE.exec(text);
  if (signature) text = text.slice(0, signature.index);

  // Drop leading '>' quote blocks that survive when a client quotes without a
  // header line (a mail that is ONLY a quote collapses to '' and is skipped).
  const kept = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');

  return kept.trim();
}

/**
 * Thread identity for a mail. RFC 5322 threading hangs off References /
 * In-Reply-To; the first reference is the thread root, and a mail that starts a
 * thread is its own root. Subject is never used — two customers writing
 * "Order question" are not the same conversation.
 */
export function threadIdOf(params: {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
}): string | null {
  const references = (params.references ?? '')
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);
  return references[0] ?? params.inReplyTo ?? params.messageId ?? null;
}

/** `Re:`-prefix a subject once, however many times the thread has bounced. */
export function replySubject(subject: string | null): string {
  const base = (subject ?? '').trim();
  if (!base) return 'Re:';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}
