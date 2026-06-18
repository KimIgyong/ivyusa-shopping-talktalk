import {
  ORDER_STATUS_INTERNAL,
  ORDER_STATUS_UI,
  OrderStatusInternal,
  OrderStatusUi,
  FULFILLMENT_STATUS,
  FulfillmentStatus,
} from '../common/enum.types';

/**
 * POL-014 / NFR-010 — single order-status mapping table.
 * internal (paid/preparing/shipping/delivered) ↔ UI (Confirmed/In Transit/Delivered/Review).
 */
export const INTERNAL_TO_UI_STATUS: Record<OrderStatusInternal, OrderStatusUi> = {
  [ORDER_STATUS_INTERNAL.PAID]: ORDER_STATUS_UI.CONFIRMED,
  [ORDER_STATUS_INTERNAL.PREPARING]: ORDER_STATUS_UI.IN_TRANSIT,
  [ORDER_STATUS_INTERNAL.SHIPPING]: ORDER_STATUS_UI.IN_TRANSIT,
  [ORDER_STATUS_INTERNAL.DELIVERED]: ORDER_STATUS_UI.DELIVERED,
};

/** Delivery stepper (SCR-011 / FR-031): 발송준비 → 배송시작 → 배송중 → 배송완료. */
export const DELIVERY_STEPS = ['발송준비', '배송시작', '배송중', '배송완료'] as const;
export type DeliveryStep = (typeof DELIVERY_STEPS)[number];

export const FULFILLMENT_TO_STEP_INDEX: Record<FulfillmentStatus, number> = {
  [FULFILLMENT_STATUS.PREPARING]: 0,
  [FULFILLMENT_STATUS.SHIPPED]: 1,
  [FULFILLMENT_STATUS.IN_TRANSIT]: 2,
  [FULFILLMENT_STATUS.DELIVERED]: 3,
};

export function internalToUiStatus(internal: string): OrderStatusUi | null {
  return INTERNAL_TO_UI_STATUS[internal as OrderStatusInternal] ?? null;
}

export function fulfillmentStepIndex(status: string): number {
  return FULFILLMENT_TO_STEP_INDEX[status as FulfillmentStatus] ?? 0;
}
