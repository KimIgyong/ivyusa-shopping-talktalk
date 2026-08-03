import { scrubPii } from './pii-scrub.util';

/**
 * pii-scrub.util — AI-egress PII minimization (privacy plan Stage 5).
 * This util guards a compliance control: every pattern gets positive cases,
 * false-positive guards, mixed-language coverage, idempotency, and counts.
 */

describe('scrubPii — emails', () => {
  it('masks a plain email', () => {
    const r = scrubPii('reach me at jane.doe@example.com please');
    expect(r.text).toBe('reach me at [EMAIL] please');
    expect(r.counts).toEqual({ email: 1 });
  });

  it('masks emails with plus tags, dots and digits in the local part', () => {
    const r = scrubPii('a.b+tag99@sub.domain-x.co.kr');
    expect(r.text).toBe('[EMAIL]');
  });

  it('masks unicode (Korean) local parts', () => {
    const r = scrubPii('이메일은 김철수99@example.com 입니다');
    expect(r.text).toBe('이메일은 [EMAIL] 입니다');
    expect(r.counts).toEqual({ email: 1 });
  });

  it('does not mask a lone @ or handle-like text without a TLD', () => {
    expect(scrubPii('mention @support in chat').text).toBe('mention @support in chat');
    expect(scrubPii('user@localhost').text).toBe('user@localhost');
  });
});

describe('scrubPii — payment cards (Luhn-gated)', () => {
  it('masks a Luhn-valid 16-digit PAN (plain)', () => {
    expect(scrubPii('card 4111111111111111 thanks').text).toBe('card [CARD] thanks');
  });

  it('masks space- and dash-separated PANs', () => {
    expect(scrubPii('4242 4242 4242 4242').text).toBe('[CARD]');
    expect(scrubPii('4242-4242-4242-4242').text).toBe('[CARD]');
  });

  it('masks a 15-digit Amex and a 13-digit Visa', () => {
    expect(scrubPii('378282246310005').text).toBe('[CARD]');
    expect(scrubPii('4222222222222').text).toBe('[CARD]');
  });

  it('does NOT card-mask a Luhn-failing 16-digit run', () => {
    const r = scrubPii('ref 1234567890123456 end');
    expect(r.text).toContain('1234567890123456');
    expect(r.counts.card).toBeUndefined();
  });

  it('cards win over phone rules (separated PAN is consumed whole)', () => {
    const r = scrubPii('pay with 4242-4242-4242-4242 now');
    expect(r.text).toBe('pay with [CARD] now');
    expect(r.counts).toEqual({ card: 1 });
  });

  it('a Luhn-failing dash-separated 13-digit run falls through to the phone rule', () => {
    // Spec: separated digit runs of 9-15 digits are phone-masked; the card
    // gate only decides it is not a CARD.
    const r = scrubPii('code 123-4567-8901-23');
    expect(r.text).toBe('code [PHONE]');
    expect(r.counts).toEqual({ phone: 1 });
  });
});

describe('scrubPii — phone numbers (positives)', () => {
  it.each([
    ['+14155550100', 'intl compact'],
    ['+1 415 555 0100', 'intl spaced'],
    ['+1 (415) 555-0100', 'intl with parens'],
    ['+82-10-1234-5678', 'intl KR'],
    ['(415) 555-0100', 'US parens'],
    ['(415)5550100', 'US parens compact'],
    ['415-555-0100', 'US dashed'],
    ['415.555.0100', 'US dotted'],
    ['010-1234-5678', 'KR mobile dashed'],
    ['010 1234 5678', 'KR mobile spaced'],
    ['01012345678', 'KR mobile compact'],
    ['017-123-4567', 'KR legacy prefix'],
    ['02-1234-5678', 'generic separated run (Seoul landline)'],
  ])('masks %s (%s)', (phone) => {
    const r = scrubPii(`call ${phone} ok`);
    expect(r.text).toBe('call [PHONE] ok');
    expect(r.counts).toEqual({ phone: 1 });
  });
});

describe('scrubPii — phone false-positive guards', () => {
  it.each([
    ['the date is 2026-07-31', 'ISO date'],
    ['delivered 07-31-2026', 'US date'],
    ['at 12:30 pm', 'time'],
    ['total $1,234.99 charged', 'price'],
    ['zip 94103 please', '5-digit zip'],
    ['zip 94103-1234 please', 'zip+4'],
    ['qty 12345678', 'plain integer < 9 digits'],
    ['SKU-12345678 restock', 'SKU code'],
    ['tracking 9400111899223100001234', 'unseparated run > 19 digits'],
    ['https://shop.example.com/products/123456789', 'URL id (unseparated)'],
    ['415 555 0100', 'space-only US without parens (documented false negative)'],
    ['ip 192.168.0.1', 'IPv4'],
    ['v1.2.3 released', 'semver'],
  ])('leaves "%s" untouched (%s)', (input) => {
    const r = scrubPii(input);
    expect(r.text).toBe(input);
    expect(r.counts).toEqual({});
  });
});

describe('scrubPii — order numbers', () => {
  it('masks Shopify-style #refs whole', () => {
    expect(scrubPii('where is #1001?').text).toBe('where is [ORDER]?');
    expect(scrubPii('#123456789 status').text).toBe('[ORDER] status');
  });

  it('keeps the phrase and masks only the number in worded forms', () => {
    expect(scrubPii('my order 1001 is late').text).toBe('my order [ORDER] is late');
    expect(scrubPii('Order number 123456 please').text).toBe('Order number [ORDER] please');
    expect(scrubPii('order no. 1001').text).toBe('order no. [ORDER]');
  });

  it('masks Korean 주문번호 phrasings', () => {
    expect(scrubPii('주문번호 1001 확인해주세요').text).toBe('주문번호 [ORDER] 확인해주세요');
    expect(scrubPii('주문 번호: 34567').text).toBe('주문 번호: [ORDER]');
    expect(scrubPii('주문 1001 취소요').text).toBe('주문 [ORDER] 취소요');
  });

  it('masks Spanish pedido/orden phrasings', () => {
    expect(scrubPii('mi pedido 12345 no llega').text).toBe('mi pedido [ORDER] no llega');
    expect(scrubPii('la orden 1001').text).toBe('la orden [ORDER]');
  });

  it('does not mask #refs under 3 digits or worded numbers outside 3-6 digits', () => {
    expect(scrubPii('#42 is my seat').text).toBe('#42 is my seat');
    expect(scrubPii('order 12 items').text).toBe('order 12 items');
    expect(scrubPii('order 1234567 units').text).toBe('order 1234567 units');
  });

  it('does not fire on order-like words without an adjacent number', () => {
    const s = 'in order to help, list orders sorted by date';
    expect(scrubPii(s).text).toBe(s);
  });

  it('does not match numbers inside URLs after order words', () => {
    const s = 'see https://shop.com/order/123456 page';
    expect(scrubPii(s).text).toBe(s);
  });
});

describe('scrubPii — street addresses (US heuristic)', () => {
  it('masks number + street + suffix', () => {
    expect(scrubPii('ship to 123 Main St today').text).toBe('ship to [ADDR] today');
    expect(scrubPii('456 Ocean Avenue').text).toBe('[ADDR]');
  });

  it('masks multi-word and ordinal street names', () => {
    expect(scrubPii('1600 Pennsylvania Ave').text).toBe('[ADDR]');
    expect(scrubPii('789 5th Ave').text).toBe('[ADDR]');
    expect(scrubPii('10 East Harbor View Blvd').text).toBe('[ADDR]');
  });

  it('consumes unit tails (Apt / Suite / #) as part of the address', () => {
    expect(scrubPii('123 Main St Apt 4B').text).toBe('[ADDR]');
    expect(scrubPii('123 Main St, Suite 200').text).toBe('[ADDR]');
    // Address runs before the order rule, so #401 is not half-masked as [ORDER].
    expect(scrubPii('123 Main St #401').text).toBe('[ADDR]');
    expect(scrubPii('123 Main St #401').counts).toEqual({ address: 1 });
  });

  it('conservative: does not fire on ordinary number + capitalized noun text', () => {
    const cases = [
      'I need 2 more days',
      'we sell 5 Great Ways to win',
      'chapter 3 Introduction section',
      'ship to 123 main st today', // lowercase — documented false negative
    ];
    for (const s of cases) {
      expect(scrubPii(s).text).toBe(s);
    }
  });
});

describe('scrubPii — mixed-PII sentences', () => {
  it('masks every kind in one English sentence', () => {
    const r = scrubPii(
      'I am jane.doe@example.com, call (415) 555-0100, card 4111 1111 1111 1111, ' +
        'order #1001, ship to 123 Main St Apt 4.',
    );
    expect(r.text).toBe(
      'I am [EMAIL], call [PHONE], card [CARD], order [ORDER], ship to [ADDR].',
    );
    expect(r.counts).toEqual({ email: 1, phone: 1, card: 1, order: 1, address: 1 });
  });

  it('masks KR phone + 주문번호 in a Korean sentence, rest untouched', () => {
    const r = scrubPii('제 번호는 010-1234-5678 이고 주문번호 1001 배송 확인 부탁드려요');
    expect(r.text).toBe('제 번호는 [PHONE] 이고 주문번호 [ORDER] 배송 확인 부탁드려요');
    expect(r.counts).toEqual({ phone: 1, order: 1 });
  });

  it('masks PII in a Spanish sentence, rest untouched', () => {
    const r = scrubPii('soy juan@mail.es, mi pedido 12345 y mi tel +34 612 34 56 78');
    expect(r.text).toBe('soy [EMAIL], mi pedido [ORDER] y mi tel [PHONE]');
    expect(r.counts).toEqual({ email: 1, order: 1, phone: 1 });
  });

  it('passes non-PII ko/es text through byte-identical', () => {
    const ko = '배송이 2026-07-31 에 온다고 했는데 아직 안 왔어요. 총 $1,234.99 결제했습니다.';
    const es = '¿Cuándo llega mi paquete? Pagué $99.99 el 2026-07-30.';
    expect(scrubPii(ko).text).toBe(ko);
    expect(scrubPii(es).text).toBe(es);
  });

  it('counts multiple instances of the same kind', () => {
    const r = scrubPii('a@b.io and c@d.io called from 415-555-0100 and 415-555-0111');
    expect(r.counts).toEqual({ email: 2, phone: 2 });
    expect(r.text).toBe('[EMAIL] and [EMAIL] called from [PHONE] and [PHONE]');
  });
});

describe('scrubPii — idempotency and edge inputs', () => {
  const samples = [
    'I am jane.doe@example.com, call (415) 555-0100, card 4242-4242-4242-4242, order #1001, ship to 123 Main St #401.',
    '제 번호는 010-1234-5678 이고 주문번호 1001 입니다',
    'no pii here, just 2026-07-31 and $1,234.99 and SKU-12345678',
  ];

  it.each(samples)('scrub(scrub(x)) === scrub(x) for "%s"', (s) => {
    const once = scrubPii(s);
    const twice = scrubPii(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.counts).toEqual({});
  });

  it('tokens themselves are never re-masked', () => {
    const s = '[EMAIL] [PHONE] [CARD] [ORDER] [ADDR]';
    const r = scrubPii(s);
    expect(r.text).toBe(s);
    expect(r.counts).toEqual({});
  });

  it('handles empty and whitespace-only input', () => {
    expect(scrubPii('')).toEqual({ text: '', counts: {} });
    expect(scrubPii('   \n\t ')).toEqual({ text: '   \n\t ', counts: {} });
  });

  it('returns an empty counts object when nothing matched', () => {
    expect(scrubPii('hello there').counts).toEqual({});
  });
});
