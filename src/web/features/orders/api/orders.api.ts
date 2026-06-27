import { buildQueryString, commandRequest, request, type ListEnvelope } from "../../../lib/api-client.js";

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "invoiced" | "settled" | "cancelled";
export type OrderGender = "M" | "F";

export type OrderDto = {
  id: string;
  order_number?: string;
  customer_id?: string;
  customer_name?: string;
  status: OrderStatus;
  total_amount?: string;
  requires_invoice?: boolean;
  invoice_type?: string;
  created_at?: string;
};

export type Order = {
  id: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
  status: OrderStatus;
  totalAmount: string;
  requiresInvoice: boolean;
  invoiceType?: string;
  createdAt?: string;
};

export type OrderFilters = {
  page: number;
  perPage: number;
  customerId?: string;
  status?: OrderStatus;
};

export type CreateOrderInput = {
  customerId: string;
  deliveryMethod?: string;
  plannedDeliveryDate?: string;
  requiresInvoice?: boolean;
  invoiceType?: string;
  notes?: string;
  items: Array<{
    strainId: string;
    ageWeeks: number;
    gender: OrderGender;
    quantity: number;
    actualPrice?: string;
  }>;
};

export type ChangeOrderPricesInput = {
  reason: string;
  items: Array<{ orderItemId: string; actualPrice: string }>;
};

export type ConfirmOrderInput = {
  confirmNote?: string;
};

export type CancelOrderInput = {
  reason: string;
};

export type SettleOrderInput = {
  settledAt?: string;
  paymentMethod?: string;
  note?: string;
};

export function mapOrderDto(dto: OrderDto): Order {
  return {
    id: dto.id,
    orderNumber: dto.order_number,
    customerId: dto.customer_id,
    customerName: dto.customer_name,
    status: dto.status,
    totalAmount: dto.total_amount ?? "0.00",
    requiresInvoice: dto.requires_invoice ?? false,
    invoiceType: dto.invoice_type,
    createdAt: dto.created_at
  };
}

export function toCreateOrderDto(input: CreateOrderInput) {
  return {
    customer_id: input.customerId,
    ...(input.deliveryMethod ? { delivery_method: input.deliveryMethod } : {}),
    ...(input.plannedDeliveryDate ? { planned_delivery_date: input.plannedDeliveryDate } : {}),
    ...(input.requiresInvoice !== undefined ? { requires_invoice: input.requiresInvoice } : {}),
    ...(input.invoiceType ? { invoice_type: input.invoiceType } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    items: input.items.map((item) => ({
      strain_id: item.strainId,
      age_weeks: item.ageWeeks,
      gender: item.gender,
      quantity: item.quantity,
      ...(item.actualPrice ? { actual_price: item.actualPrice } : {})
    }))
  };
}

export function toChangeOrderPricesDto(input: ChangeOrderPricesInput) {
  return {
    reason: input.reason,
    items: input.items.map((item) => ({ order_item_id: item.orderItemId, actual_price: item.actualPrice }))
  };
}

export async function listOrders(filters: OrderFilters, token: string | null): Promise<ListEnvelope<Order>> {
  const response = await request<ListEnvelope<OrderDto>>(
    `/orders${buildQueryString({
      page: filters.page,
      per_page: filters.perPage,
      customer_id: filters.customerId,
      status: filters.status
    })}`,
    { token }
  );
  return { ...response, data: response.data.map(mapOrderDto) };
}

export async function getOrder(orderId: string, token: string | null): Promise<Order> {
  const response = await request<OrderDto>(`/orders/${orderId}`, { token });
  return mapOrderDto(response);
}

export async function createOrder(input: CreateOrderInput, token: string | null): Promise<{ id: string; orderNumber?: string; status: OrderStatus; totalAmount: string }> {
  const response = await commandRequest<{ id: string; order_number?: string; status: OrderStatus; total_amount?: string }>("/orders", {
    token,
    body: toCreateOrderDto(input)
  });
  return { id: response.id, orderNumber: response.order_number, status: response.status, totalAmount: response.total_amount ?? "0.00" };
}

export async function confirmOrder(orderId: string, input: ConfirmOrderInput, token: string | null): Promise<{ id: string; status: OrderStatus; deliveryTaskId?: string }> {
  const response = await commandRequest<{ id: string; status: OrderStatus; delivery_task_id?: string }>(`/orders/${orderId}/confirm`, {
    token,
    body: input.confirmNote ? { confirm_note: input.confirmNote } : {}
  });
  return { id: response.id, status: response.status, deliveryTaskId: response.delivery_task_id };
}

export async function changeOrderPrices(orderId: string, input: ChangeOrderPricesInput, token: string | null): Promise<{ id: string }> {
  return commandRequest<{ id: string }>(`/orders/${orderId}/change-prices`, {
    token,
    body: toChangeOrderPricesDto(input)
  });
}

export async function cancelOrder(orderId: string, input: CancelOrderInput, token: string | null): Promise<{ id: string; status: OrderStatus }> {
  return commandRequest<{ id: string; status: OrderStatus }>(`/orders/${orderId}/cancel`, {
    token,
    body: { reason: input.reason }
  });
}

export async function settleOrder(orderId: string, input: SettleOrderInput, token: string | null): Promise<{ id: string; status: OrderStatus }> {
  return commandRequest<{ id: string; status: OrderStatus }>(`/orders/${orderId}/settle`, {
    token,
    body: {
      ...(input.settledAt ? { settled_at: input.settledAt } : {}),
      ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
      ...(input.note ? { note: input.note } : {})
    }
  });
}
