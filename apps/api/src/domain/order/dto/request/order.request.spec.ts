import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OrderListQuery } from './order.request';
import { InquiryListQuery } from '../../../inquiry/dto/request/inquiry.request';

/**
 * Regression for FIX-Widget-Orders-400-20260803: the widget's api-client lifts the
 * session token into the `X-Session-Token` header and strips it from GET params
 * (PRV-M7/FE-M3), so a widget list request arrives with NO `session_token` in the
 * query. When these query DTOs required it, the global ValidationPipe answered 400
 * ("session_token must be a string") before `@SessionToken()` ever ran — the
 * widget's Orders tab just showed "Something went wrong". Auth is still enforced:
 * the decorator throws 401 when no token resolves from header, query or path.
 */
describe.each([
  ['OrderListQuery', OrderListQuery],
  ['InquiryListQuery', InquiryListQuery],
])('%s — session token comes from the header, not the query', (_name, Dto) => {
  function errorsFor(payload: Record<string, unknown>): string[] {
    return validateSync(plainToInstance(Dto as never, payload)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
  }

  it('accepts a query with no session_token (header-authenticated request)', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('accepts pagination without a session_token', () => {
    expect(errorsFor({ page: '2', size: '20' })).toEqual([]);
  });

  it('still accepts a session_token in the query (back-compat)', () => {
    expect(errorsFor({ session_token: 'tok' })).toEqual([]);
  });

  it('rejects a non-string session_token', () => {
    expect(errorsFor({ session_token: 123 }).join(' ')).toMatch(/must be a string/);
  });
});
