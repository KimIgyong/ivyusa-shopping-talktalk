import { NotificationsTab } from '../notifications/NotificationsTab';

/**
 * The Orders tab (PLN-260817-Widget-Tab-Config S4).
 *
 * Deliberately thin. This is NOT the pre-#301 OrdersTab restored: the order
 * list, shipment tracker, review form and issue feed all live in the shared
 * list tab now, and this only asks for them under the order-side chips
 * (`payment` / `shipping` / `review` / `inquiries`). Rebuilding a parallel
 * implementation here is what would let the two drift apart again.
 */
export function OrdersTab() {
  return <NotificationsTab tab="orders" />;
}
