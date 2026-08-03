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

/**
 * Delivery stepper labels (SCR-011 / FR-031), localized per UI language: the
 * 4 steps mirror FULFILLMENT_TO_STEP_INDEX (preparing → shipped → in transit →
 * delivered). These are customer-facing strings, so they must follow
 * `session.language` — never ship one hardcoded language to every locale.
 */
export const DELIVERY_STEPS_BY_LANG = {
  EN: ['Preparing', 'Shipped', 'In transit', 'Delivered'],
  ES: ['En preparación', 'Enviado', 'En tránsito', 'Entregado'],
  KO: ['발송준비', '배송시작', '배송중', '배송완료'],
} as const;

export type DeliveryStepLang = keyof typeof DELIVERY_STEPS_BY_LANG;

/** Localized delivery steps for a session language; falls back to EN. */
export function deliverySteps(language: string | null | undefined): readonly string[] {
  const key = String(language ?? '').toUpperCase();
  return (
    (DELIVERY_STEPS_BY_LANG as Record<string, readonly string[]>)[key] ??
    DELIVERY_STEPS_BY_LANG.EN
  );
}

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
