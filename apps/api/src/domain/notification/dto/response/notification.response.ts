/** Input accepted by NotificationService.notify and the EVENTS.NOTIFICATION handler. */
export interface NotifyInput {
  // Emitters MUST pass tenantId explicitly: EVENTS.NOTIFICATION handlers run
  // detached (setImmediate) outside the request's ALS tenant context, so the
  // TenantSubscriber cannot stamp it on insert.
  tenantId?: number | null;
  customerId?: number | null;
  sessionId?: number | null;
  category: string;
  title: string;
  body?: string | null;
  statusBadge?: string | null;
  channel?: string | null;
  /** Deep-link target persisted on the row (campaign product/url — A-9). */
  linkUrl?: string | null;
  /**
   * In-app reference this notification is about, e.g. `'order_item'` + the item
   * id for a review request (PLN-260817 S5). Emitters that omit it get NULLs and
   * the client simply renders no action.
   */
  refType?: string | null;
  refId?: number | null;
  /**
   * Catalog handle for client-side product routing. NOT persisted — pass-through
   * onto the PUSH_DISPATCH payload only (the app prefers /products/:handle).
   */
  productHandle?: string | null;
}
