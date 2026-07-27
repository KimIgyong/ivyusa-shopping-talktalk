import {
  internalToUiStatus,
  fulfillmentStepIndex,
  deliverySteps,
  DELIVERY_STEPS_BY_LANG,
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

describe('status-map — fulfillmentStepIndex & delivery steps', () => {
  it('has a 4-step delivery stepper in every supported language', () => {
    for (const lang of ['EN', 'ES', 'KO'] as const) {
      expect(DELIVERY_STEPS_BY_LANG[lang]).toHaveLength(4);
    }
    expect(DELIVERY_STEPS_BY_LANG.KO).toEqual(['발송준비', '배송시작', '배송중', '배송완료']);
  });

  it('returns the steps for the session language (case-insensitive)', () => {
    expect(deliverySteps('KO')).toEqual(DELIVERY_STEPS_BY_LANG.KO);
    expect(deliverySteps('es')).toEqual(DELIVERY_STEPS_BY_LANG.ES);
    expect(deliverySteps('EN')).toEqual(DELIVERY_STEPS_BY_LANG.EN);
  });

  it('falls back to EN for an unknown, empty or missing language', () => {
    expect(deliverySteps('fr')).toEqual(DELIVERY_STEPS_BY_LANG.EN);
    expect(deliverySteps('')).toEqual(DELIVERY_STEPS_BY_LANG.EN);
    expect(deliverySteps(null)).toEqual(DELIVERY_STEPS_BY_LANG.EN);
    expect(deliverySteps(undefined)).toEqual(DELIVERY_STEPS_BY_LANG.EN);
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

  it('every step index is a valid position in every language', () => {
    for (const lang of ['EN', 'ES', 'KO'] as const) {
      for (const status of ['preparing', 'shipped', 'in_transit', 'delivered']) {
        const idx = fulfillmentStepIndex(status);
        expect(deliverySteps(lang)[idx]).toBeDefined();
      }
    }
  });
});
