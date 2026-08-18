import type { TFunction } from 'i18next';
import {
  isOrderDelivered,
  isOrderInTransit,
  orderStatusLabel,
} from '../../../../../packages/types/src/common/order-status';
import type { OrderSummary } from '../../lib/types';

/**
 * Thin i18n adapter over the shared status rules.
 *
 * The rules live in `packages/types` because the widget has no test runner and
 * the fallback chain is worth pinning; the source path is imported directly
 * because a value import from `@ivy/types` breaks the browser build (CJS
 * `export *`) — same as `lib/theme.ts` does for the theme engine.
 */
type StatusFields = Pick<OrderSummary, 'statusInternal' | 'statusUi'>;

export function statusLabel(t: TFunction, order: StatusFields): string | null {
  return orderStatusLabel(order, (key) => t(`orders.status.${key}`));
}

export const isInTransit = (order: StatusFields): boolean => isOrderInTransit(order);
export const isDelivered = (order: StatusFields): boolean => isOrderDelivered(order);

/** Shown under the Shipping chip: on its way, or already there. */
export const isShipmentish = (order: StatusFields): boolean =>
  isOrderInTransit(order) || isOrderDelivered(order);
