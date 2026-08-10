import { replySubject, stripQuotedReply, threadIdOf } from './mail-text.util';
import { extractPlainText, readHeader } from './gmail-imap.adapter';

/**
 * Mail normalization (PLN-260810 PR-M4). A reply email repeats the thread; if
 * that history reaches the AI it both wastes context and lets an old question
 * outrank the new one in retrieval.
 */
describe('stripQuotedReply', () => {
  it('keeps only the newly written part of a Gmail reply', () => {
    const body = [
      '환불 언제 되나요?',
      '',
      'On Mon, 10 Aug 2026 at 14:31, Support <support@ivyusa.com> wrote:',
      '> 안녕하세요, 확인 후 안내드리겠습니다.',
      '> 감사합니다.',
    ].join('\n');

    expect(stripQuotedReply(body)).toBe('환불 언제 되나요?');
  });

  it('cuts at an Outlook original-message separator', () => {
    const body = 'Where is my order?\n\n-----Original Message-----\nFrom: Support\nHello';
    expect(stripQuotedReply(body)).toBe('Where is my order?');
  });

  it('cuts at the Korean Gmail quote header', () => {
    const body = '재고 있나요?\n\n2026년 8월 10일 (월) 오후 2:31, 지원팀님이 작성:\n> 안녕하세요';
    expect(stripQuotedReply(body)).toBe('재고 있나요?');
  });

  it('drops the signature block', () => {
    expect(stripQuotedReply('Thanks!\n\n-- \nJane\nAcme Corp')).toBe('Thanks!');
  });

  it('returns empty for a mail that is nothing but quoted history', () => {
    expect(stripQuotedReply('> old line\n> another')).toBe('');
  });

  it('leaves a plain first-contact mail untouched', () => {
    expect(stripQuotedReply('Hi, do you ship to Canada?')).toBe('Hi, do you ship to Canada?');
  });
});

describe('threadIdOf', () => {
  it('uses the first reference as the thread root', () => {
    expect(
      threadIdOf({
        messageId: '<c@mail>',
        inReplyTo: '<b@mail>',
        references: '<a@mail> <b@mail>',
      }),
    ).toBe('<a@mail>');
  });

  it('falls back to In-Reply-To, then to its own id', () => {
    expect(threadIdOf({ messageId: '<c@mail>', inReplyTo: '<b@mail>', references: null })).toBe('<b@mail>');
    expect(threadIdOf({ messageId: '<c@mail>', inReplyTo: null, references: null })).toBe('<c@mail>');
  });

  it('returns null when the mail carries no identity at all', () => {
    expect(threadIdOf({ messageId: null, inReplyTo: null, references: null })).toBeNull();
  });
});

describe('replySubject', () => {
  it('prefixes once, however many times the thread bounced', () => {
    expect(replySubject('Order 1234')).toBe('Re: Order 1234');
    expect(replySubject('Re: Order 1234')).toBe('Re: Order 1234');
    expect(replySubject('RE: Order 1234')).toBe('RE: Order 1234');
    expect(replySubject(null)).toBe('Re:');
  });
});

describe('extractPlainText', () => {
  it('picks the text/plain part out of a multipart mail', () => {
    const source = [
      'Content-Type: multipart/alternative; boundary="B1"',
      '',
      '--B1',
      'Content-Type: text/html; charset=UTF-8',
      '',
      '<p>ignored</p>',
      '--B1',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'the real question',
      '--B1--',
    ].join('\r\n');

    expect(extractPlainText(source)).toContain('the real question');
    expect(extractPlainText(source)).not.toContain('ignored');
  });

  it('decodes quoted-printable and base64 bodies', () => {
    const qp = 'Content-Transfer-Encoding: quoted-printable\n\nCaf=C3=A9 order';
    expect(extractPlainText(qp)).toBe('Café order');

    const b64 = `Content-Transfer-Encoding: base64\n\n${Buffer.from('배송 문의').toString('base64')}`;
    expect(extractPlainText(b64)).toBe('배송 문의');
  });

  it('returns the body of a simple single-part mail', () => {
    expect(extractPlainText('Subject: hi\n\nplain body')).toBe('plain body');
  });
});

describe('readHeader', () => {
  it('reads a header and unfolds continuation lines', () => {
    const source = 'References: <a@mail>\r\n <b@mail>\r\nSubject: hi\r\n\r\nbody';
    expect(readHeader(source, 'references')).toBe('<a@mail> <b@mail>');
  });

  it('does not read past the header block', () => {
    expect(readHeader('Subject: hi\n\nReferences: <x@mail>', 'references')).toBeNull();
  });
});
