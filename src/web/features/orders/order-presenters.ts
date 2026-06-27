import type { OrderStatus } from "./api/orders.api.js";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered", "invoiced", "settled", "cancelled"];

export function parseOrderStatus(value: string | null): OrderStatus | undefined {
  return ORDER_STATUSES.includes(value as OrderStatus) ? value as OrderStatus : undefined;
}

export function orderStatusTone(status: OrderStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "cancelled") return "danger";
  if (status === "pending") return "warning";
  if (status === "settled" || status === "delivered") return "success";
  return "neutral";
}
