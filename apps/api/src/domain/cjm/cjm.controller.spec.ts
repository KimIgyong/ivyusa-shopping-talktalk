import { HttpStatus } from '@nestjs/common';
import { CjmMeController } from './cjm.controller';
import { CjmService } from './cjm.service';
import { SessionService } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** GET /me/journey — the customer's own journey timeline (PLN-260807 F3, A-7). */
describe('CjmMeController', () => {
  const event = {
    id: 5,
    tenantId: 7,
    sessionId: 11,
    customerId: 42,
    stage: 'Browse',
    eventType: 'product_view',
    payload: { handle: 'vitamin-c-serum' },
    createdAt: new Date('2026-08-07T00:00:00Z'),
  };

  function build(opts?: { anonymous?: boolean }) {
    const listForCustomer = jest.fn(async () => [[event], 1]);
    const cjmService = { listForCustomer } as unknown as CjmService;
    const sessionService = {
      requireCustomerId: jest.fn(async () => {
        if (opts?.anonymous) {
          throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
        }
        return 42;
      }),
    } as unknown as SessionService;
    return { ctrl: new CjmMeController(cjmService, sessionService), listForCustomer };
  }

  it('pages the bound customer and maps rows to {id, stage, eventType, payload, createdAt}', async () => {
    const { ctrl, listForCustomer } = build();
    const res = await ctrl.journey('tok', '2', '20');
    expect(listForCustomer).toHaveBeenCalledWith(42, 2, 20);
    expect(res.items).toEqual([
      {
        id: 5,
        stage: 'Browse',
        eventType: 'product_view',
        payload: { handle: 'vitamin-c-serum' },
        createdAt: event.createdAt,
      },
    ]);
    expect(res.pagination).toMatchObject({ page: 2, size: 20, totalCount: 1 });
  });

  it('rejects an anonymous (unbound) session with 401 before touching the service', async () => {
    const { ctrl, listForCustomer } = build({ anonymous: true });
    const err = await ctrl.journey('tok').catch((e) => e);
    expect(err).toBeInstanceOf(BusinessException);
    expect(err.getStatus()).toBe(401);
    expect(listForCustomer).not.toHaveBeenCalled();
  });
});
