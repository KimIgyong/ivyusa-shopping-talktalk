import {
  internalToUiStatus,
  fulfillmentStepIndex,
  DELIVERY_STEPS,
} from './status-map';
import { ORDER_STATUS_UI } from '../common/enum.types';

describe('status-map — internalToUiStatus', () => {
  it('maps paid → Confirmed', () => {
    expect(internalToUiStatus('paid')).toBe(ORDER_STATUS_UI.CONFIRMED);
  });

  it('maps preparing & shipping → In Transit', () => {
    expect(internalToUiStatus('preparing')).toBe(ORDER_STATUS_UI.IN_TRANSIT);
    expect(internalToUiStatus('shipping')).toBe(ORDER_STATUS_UI.IN_TRANSIT);
  });

  it('maps delivered → Delivered', () => {
    expect(internalToUiStatus('delivered')).toBe(ORDER_STATUS_UI.DELIVERED);
  });

  it('returns null for an unknown internal status', () => {
    expect(internalToUiStatus('refunded')).toBeNull();
    expect(internalToUiStatus('')).toBeNull();
  });
});

describe('status-map — fulfillmentStepIndex & DELIVERY_STEPS', () => {
  it('has a 4-step delivery stepper', () => {
    expect(DELIVERY_STEPS).toHaveLength(4);
    expect(DELIVERY_STEPS).toEqual(['발송준비', '배송시작', '배송중', '배송완료']);
  });

  it('maps fulfillment statuses to their step index', () => {
    expect(fulfillmentStepIndex('preparing')).toBe(0);
    expect(fulfillmentStepIndex('shipped')).toBe(1);
    expect(fulfillmentStepIndex('in_transit')).toBe(2);
    expect(fulfillmentStepIndex('delivered')).toBe(3);
  });

  it('defaults unknown fulfillment status to step 0', () => {
    expect(fulfillmentStepIndex('bogus')).toBe(0);
  });

  it('every step index is a valid DELIVERY_STEPS position', () => {
    for (const status of ['preparing', 'shipped', 'in_transit', 'delivered']) {
      const idx = fulfillmentStepIndex(status);
      expect(DELIVERY_STEPS[idx]).toBeDefined();
    }
  });
});
