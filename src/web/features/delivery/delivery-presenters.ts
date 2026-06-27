import type { DeliveryTaskStatus, ShipmentSuggestion } from "./api/delivery.api.js";

export const DELIVERY_STATUSES: DeliveryTaskStatus[] = ["pending_schedule", "scheduled", "shipped", "delivered", "cancelled"];

export function parseDeliveryStatus(value: string | null): DeliveryTaskStatus | undefined {
  return DELIVERY_STATUSES.includes(value as DeliveryTaskStatus) ? value as DeliveryTaskStatus : undefined;
}

export function deliveryStatusTone(status: DeliveryTaskStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "delivered") return "success";
  if (status === "cancelled") return "danger";
  if (status === "pending_schedule") return "warning";
  return "neutral";
}

export function formatShipmentSuggestion(suggestion: ShipmentSuggestion): string[] {
  return suggestion.suggestedBatches.map(
    (batch) => `建议批次 ${batch.inventoryBatchId}，建议数量 ${batch.quantity}，原因：${batch.reason}`
  );
}
