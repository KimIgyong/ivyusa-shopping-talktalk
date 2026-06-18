import { internalToUiStatus } from '@ivy/types';
import { OrderCache } from './entity/order-cache.entity';
import { OrderItem } from './entity/order-item.entity';

export interface OrderSummary {
  id: number;
  orderNumber: string;
  statusUi: string | null;
  total: number | null;
}

export interface OrderListItem {
  id: number;
  orderNumber: string;
  statusInternal: string | null;
  statusUi: string | null;
  total: number | null;
  currency: string | null;
  createdAt: Date;
  itemCount: number;
}

export interface OrderItemView {
  title: string;
  optionText: string | null;
  qty: number;
  price: number | null;
}

export interface OrderDetailView {
  id: number;
  orderNumber: string;
  statusInternal: string | null;
  statusUi: string | null;
  total: number | null;
  currency: string | null;
  createdAt: Date;
  items: OrderItemView[];
}

/** Entity -> response mapping for orders (camelCase payloads). */
export class OrderMapper {
  private static uiStatus(order: OrderCache): string | null {
    return order.statusInternal ? internalToUiStatus(order.statusInternal) : order.statusUi;
  }

  static toSummary(order: OrderCache): OrderSummary {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      statusUi: this.uiStatus(order),
      total: order.total,
    };
  }

  static toListItem(order: OrderCache, itemCount: number): OrderListItem {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      statusInternal: order.statusInternal,
      statusUi: this.uiStatus(order),
      total: order.total,
      currency: order.currency,
      createdAt: order.createdAt,
      itemCount,
    };
  }

  static toItemView(item: OrderItem): OrderItemView {
    return {
      title: item.title,
      optionText: item.optionText,
      qty: item.qty,
      price: item.price,
    };
  }

  static toDetail(order: OrderCache, items: OrderItem[]): OrderDetailView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      statusInternal: order.statusInternal,
      statusUi: this.uiStatus(order),
      total: order.total,
      currency: order.currency,
      createdAt: order.createdAt,
      items: items.map((i) => this.toItemView(i)),
    };
  }
}
