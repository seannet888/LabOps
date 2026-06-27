export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "invoiced"
  | "settled"
  | "cancelled";

export type OrderTransitionActor = "sales" | "manager" | "delivery_sync";

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(["settled", "cancelled"]);

const SALES_DRIVEN_TRANSITIONS: ReadonlySet<string> = new Set([
  "pending->confirmed",
  "delivered->invoiced",
  "invoiced->settled"
]);

const DELIVERY_SYNC_TRANSITIONS: ReadonlySet<string> = new Set(["confirmed->shipped", "shipped->delivered"]);

const CANCELLABLE_FROM: ReadonlySet<OrderStatus> = new Set(["pending", "confirmed", "delivered", "invoiced"]);

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderTransitionActor
): boolean {
  if (TERMINAL_STATUSES.has(from)) {
    return false;
  }

  if (to === "cancelled") {
    return (actor === "sales" || actor === "manager") && CANCELLABLE_FROM.has(from);
  }

  const transition = `${from}->${to}`;

  if (actor === "delivery_sync") {
    return DELIVERY_SYNC_TRANSITIONS.has(transition);
  }

  return SALES_DRIVEN_TRANSITIONS.has(transition);
}

const PRICE_LOCKED_STATUSES: ReadonlySet<OrderStatus> = new Set(["shipped", "settled"]);

export function canChangeOrderPrice(status: OrderStatus): boolean {
  return !PRICE_LOCKED_STATUSES.has(status);
}
