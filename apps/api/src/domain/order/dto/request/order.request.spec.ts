import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderListQuery } from './order.request';
import { InquiryListQuery } from '../../../inquiry/dto/request/inquiry.request';

/**
 * Regression for FIX-Widget-Orders-400-20260803: the widget sends the session
 * token in the X-Session-Token header (PRV-M7/FE-M3), so widget list queries
 * arrive WITHOUT a session_token query param. A required query field makes the
 * global ValidationPipe reject every header-authenticated GET with 400 before
 * @SessionToken() can resolve the header.
 */
describe('widget list query DTOs (header-auth compatible)', () => {
  it.each([
    ['OrderListQuery', OrderListQuery],
    ['InquiryListQuery', InquiryListQuery],
  ])('%s validates with no query params (token in header)', async (_name, cls) => {
    const errors = await validate(plainToInstance(cls as never, {}));
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['OrderListQuery', OrderListQuery],
    ['InquiryListQuery', InquiryListQuery],
  ])('%s still accepts the legacy query token + pagination', async (_name, cls) => {
    const errors = await validate(
      plainToInstance(cls as never, { session_token: 'tok', page: '1', size: '10' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string session_token', async () => {
    const errors = await validate(plainToInstance(OrderListQuery, { session_token: 5 }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
