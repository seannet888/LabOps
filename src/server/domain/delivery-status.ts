export type DeliveryTaskStatus = "pending_schedule" | "scheduled" | "shipped" | "delivered" | "cancelled";

const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  "pending_schedule->scheduled",
  "scheduled->shipped",
  "shipped->delivered"
]);

const LOCKED_FOR_SALES_ACTION_FLAG: ReadonlySet<DeliveryTaskStatus> = new Set(["shipped", "delivered"]);

export function canTransitionDeliveryTaskStatus(from: DeliveryTaskStatus, to: DeliveryTaskStatus): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

export function canFlagSalesActionRequired(status: DeliveryTaskStatus): boolean {
  return !LOCKED_FOR_SALES_ACTION_FLAG.has(status);
}
